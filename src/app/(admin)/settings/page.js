"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { auth } from "@/utils/firebaseConfig";
import { signOut } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/utils/authContext";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import posthog from "posthog-js";

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { user, refreshUser } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("monthly");
  const [affiliateStats, setAffiliateStats] = useState(null);
  const [becomingAffiliate, setBecomingAffiliate] = useState(false);
  const [editingAffiliateCode, setEditingAffiliateCode] = useState(false);
  const [newAffiliateCode, setNewAffiliateCode] = useState("");
  const [updatingAffiliateCode, setUpdatingAffiliateCode] = useState(false);

  useEffect(() => {
    const fetchUserDetails = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;

        const response = await fetch("/api/user", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setDisplayName(data.displayName || "");
          setEmail(auth.currentUser?.email || "");
        }
      } catch (error) {
        console.error("Error fetching user details:", error);
      }
    };

    fetchUserDetails();
  }, []);

  // Check for Stripe success/canceled status
  useEffect(() => {
    if (searchParams.get("success")) {
      toast({
        title: "Success!",
        description:
          "Your subscription has been processed. You now have pro access!",
      });
      refreshUser();
    }

    if (searchParams.get("canceled")) {
      toast({
        title: "Canceled",
        description: "Your subscription was canceled.",
        variant: "destructive",
      });
    }

    if (searchParams.get("portal_return")) {
      toast({
        title: "Settings Updated",
        description: "Your subscription settings have been updated.",
      });
      refreshUser();
    }

    // Handle affiliate onboarding completion
    if (searchParams.get("affiliate_onboarding") === "complete") {
      const accountId = searchParams.get("account_id");

      if (accountId) {
        const checkOnboardingStatus = async () => {
          try {
            const token = await auth.currentUser?.getIdToken();
            if (!token) return;

            const response = await fetch("/api/affiliate", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                action: "check_onboarding_status",
                accountId,
              }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
              toast({
                title: "Success!",
                description:
                  "Your Stripe account has been connected successfully.",
              });
              await refreshUser();

              // Refresh affiliate stats
              const statsResponse = await fetch("/api/affiliate", {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              });

              if (statsResponse.ok) {
                const statsData = await statsResponse.json();
                setAffiliateStats(statsData);
              }
            } else {
              toast({
                title: "Stripe Setup Incomplete",
                description:
                  "You can complete your Stripe setup later to receive payments.",
                variant: "destructive",
              });
            }
          } catch (error) {
            toast({
              title: "Error",
              description:
                "Failed to connect Stripe account. You can try again later.",
              variant: "destructive",
            });
          }
        };

        checkOnboardingStatus();
      }
    }

    if (searchParams.get("affiliate_onboarding") === "refresh") {
      toast({
        title: "Stripe Setup Incomplete",
        description:
          "You can complete your Stripe setup later to receive payments.",
        variant: "destructive",
      });
    }
  }, [searchParams, toast, refreshUser]);

  useEffect(() => {
    const fetchAffiliateStats = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;

        const response = await fetch("/api/affiliate", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setAffiliateStats(data);
        }
      } catch (error) {
        console.error("Error fetching affiliate stats:", error);
      }
    };

    fetchAffiliateStats();
  }, []);

  const handleSave = async () => {
    try {
      setLoading(true);
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("No authentication token");

      const response = await fetch("/api/user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ displayName }),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Your settings have been saved.",
        });
      } else {
        throw new Error("Failed to save settings");
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({
        title: "Error",
        description: "Failed to save settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/");
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  const handleUpgrade = async () => {
    try {
      setUpgrading(true);

      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("No authentication token");

      const priceId =
        selectedPlan === "monthly"
          ? process.env.STRIPE_MONTHLY_PRICE_ID
          : process.env.STRIPE_YEARLY_PRICE_ID;

      const response = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ priceId }),
      });

      const data = await response.json();

      if (response.ok && data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        throw new Error("Failed to create checkout session");
      }
    } catch (error) {
      console.error("Error starting upgrade:", error);
      toast({
        title: "Error",
        description: "Failed to start upgrade process. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUpgrading(false);
    }
  };

  const handleManageSubscription = async () => {
    try {
      setLoading(true);
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("No authentication token");

      const response = await fetch("/api/stripe/create-portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.ok && data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("Failed to create portal session");
      }
    } catch (error) {
      console.error("Error accessing customer portal:", error);
      toast({
        title: "Error",
        description:
          "Failed to access subscription management. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBecomeAffiliate = async () => {
    try {
      setBecomingAffiliate(true);
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("No authentication token");

      const response = await fetch("/api/affiliate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "become_affiliate" }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // If we have a Stripe onboarding URL, redirect to it
        if (data.onboardingUrl) {
          window.location.href = data.onboardingUrl;
        } else {
          // Otherwise just show success message
          toast({
            title: "Success!",
            description:
              "You are now an affiliate! You can set up Stripe payments later.",
          });
          await refreshUser();
          // Refresh affiliate stats
          const statsResponse = await fetch("/api/affiliate", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            setAffiliateStats(statsData);
          }
        }
      } else {
        throw new Error(data.error || "Failed to become affiliate");
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          error.message || "Failed to become an affiliate. Please try again.",
        variant: "destructive",
      });
    } finally {
      setBecomingAffiliate(false);
    }
  };

  const handleManageAffiliate = async () => {
    try {
      setLoading(true);
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("No authentication token");

      console.log("Making request to create dashboard link...");
      const response = await fetch("/api/affiliate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "create_dashboard_link" }),
      });

      const data = await response.json();
      console.log("Dashboard link response:", {
        status: response.status,
        data,
      });

      if (response.ok && data.url) {
        if (data.isOnboarding) {
          console.log("Redirecting to onboarding URL:", data.url);
          toast({
            title: "Completing Setup",
            description:
              "Please complete your Stripe account setup to access the dashboard.",
          });
        } else {
          console.log("Redirecting to dashboard URL:", data.url);
        }
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "Failed to access affiliate dashboard");
      }
    } catch (error) {
      console.error("Error in handleManageAffiliate:", error);
      toast({
        title: "Error",
        description:
          error.message ||
          "Failed to access affiliate dashboard. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateAffiliateCode = async () => {
    try {
      setUpdatingAffiliateCode(true);
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("No authentication token");

      const response = await fetch("/api/affiliate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "update_affiliate_code",
          affiliateCode: newAffiliateCode,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setAffiliateStats((prev) => ({
          ...prev,
          affiliateCode: data.affiliateCode,
        }));
        setEditingAffiliateCode(false);
        toast({
          title: "Success",
          description: "Your affiliate code has been updated.",
        });
      } else {
        if (data.error === "AFFILIATE_CODE_EXISTS") {
          toast({
            title: "Code Unavailable",
            description:
              "This affiliate code is already in use. Please try another one.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Error",
            description: data.error || "Failed to update affiliate code",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error("Error updating affiliate code:", error);
      toast({
        title: "Error",
        description: "Failed to update affiliate code. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUpdatingAffiliateCode(false);
    }
  };

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-2xl font-bold pb-5">Settings</div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Settings</CardTitle>
              <CardDescription>
                Manage your profile information and preferences.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Display Name</Label>
                <Input
                  id="name"
                  placeholder="Your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  disabled
                  className="bg-muted"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Membership</CardTitle>
              <CardDescription>Manage your RWB Bets membership</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Current Plan</h3>
                    <p className="text-sm text-muted-foreground">
                      {user?.pro_access ? "Pro" : "Free"}
                    </p>
                    {user?.pro_access && user?.subscriptionCurrentPeriodEnd && (
                      <p className="text-sm text-muted-foreground">
                        {user.cancelAtPeriodEnd ? "Cancels on " : "Renews on "}
                        {new Date(
                          user.subscriptionCurrentPeriodEnd
                        ).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
                {user?.pro_access ? (
                  <div className="flex justify-start">
                    <Button
                      onClick={handleManageSubscription}
                      disabled={loading}
                    >
                      {loading ? "Loading..." : "Manage Subscription"}
                    </Button>
                  </div>
                ) : (
                  <>
                    <RadioGroup
                      value={selectedPlan}
                      onValueChange={setSelectedPlan}
                      className="grid grid-cols-2 gap-4 pt-2"
                    >
                      <div>
                        <RadioGroupItem
                          value="monthly"
                          id="monthly"
                          className="peer sr-only"
                        />
                        <Label
                          htmlFor="monthly"
                          className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                        >
                          <div className="mb-1">Monthly</div>
                          <div className="text-2xl font-bold">$10</div>
                          <div className="text-sm text-muted-foreground">
                            per month
                          </div>
                        </Label>
                      </div>
                      <div>
                        <RadioGroupItem
                          value="yearly"
                          id="yearly"
                          className="peer sr-only"
                        />
                        <Label
                          htmlFor="yearly"
                          className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                        >
                          <div className="mb-1">Yearly</div>
                          <div className="text-2xl font-bold flex items-center gap-2">
                            <span className="text-lg line-through text-muted-foreground">
                              $120
                            </span>
                            $100
                          </div>
                          <div className="text-sm text-muted-foreground">
                            per year
                          </div>
                        </Label>
                      </div>
                    </RadioGroup>
                    <Button
                      variant="default"
                      onClick={() => {
                        handleUpgrade();
                        posthog.capture("Upgrade Button Clicked", {
                          plan: selectedPlan,
                          source: "settings",
                        });
                      }}
                      disabled={upgrading}
                      className="w-full mt-4"
                    >
                      {upgrading
                        ? "Processing..."
                        : `Upgrade to Pro ${
                            selectedPlan === "yearly" ? "Yearly" : "Monthly"
                          }`}
                    </Button>
                    <div className="text-sm text-muted-foreground">
                      <p>Upgrade to pro to get:</p>
                      <ul className="list-disc list-inside mt-2 space-y-1">
                        <li>Access to the full projections list</li>
                        <li>Cancel anytime</li>
                        <li>Priority support</li>
                      </ul>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Affiliate Program</CardTitle>
              <CardDescription>
                Earn money by referring new users to RWB Bets
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {affiliateStats?.isAffiliate ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Your Affiliate Code</Label>
                      <div className="flex items-center gap-2">
                        {editingAffiliateCode ? (
                          <div className="flex-1 flex gap-2">
                            <Input
                              value={newAffiliateCode}
                              onChange={(e) =>
                                setNewAffiliateCode(e.target.value)
                              }
                              placeholder="Enter new affiliate code"
                              className="font-mono"
                            />
                            <Button
                              variant="default"
                              onClick={handleUpdateAffiliateCode}
                              disabled={updatingAffiliateCode}
                            >
                              {updatingAffiliateCode ? "Saving..." : "Save"}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setEditingAffiliateCode(false);
                                setNewAffiliateCode("");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <>
                            <Input
                              value={affiliateStats.affiliateCode}
                              readOnly
                              className="bg-muted font-mono"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => {
                                setNewAffiliateCode(
                                  affiliateStats.affiliateCode
                                );
                                setEditingAffiliateCode(true);
                              }}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                <path d="m15 5 4 4" />
                              </svg>
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  `${process.env.NEXT_PUBLIC_APP_URL}?ref=${affiliateStats.affiliateCode}`
                                );
                                toast({
                                  title: "Copied!",
                                  description:
                                    "Affiliate link copied to clipboard",
                                });
                              }}
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <rect
                                  width="13"
                                  height="13"
                                  x="9"
                                  y="9"
                                  rx="2"
                                  ry="2"
                                />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-end">
                      <Button
                        variant="outline"
                        onClick={handleManageAffiliate}
                        disabled={loading}
                        className="w-full"
                      >
                        {loading ? "Loading..." : "Manage Account"}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Total Earnings</Label>
                      <div className="text-2xl font-bold">
                        ${Number(affiliateStats.totalEarnings).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <Label>Unpaid Earnings</Label>
                      <div className="text-2xl font-bold">
                        ${Number(affiliateStats.unpaidEarnings).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Recent Referrals</Label>
                    {affiliateStats.referrals.length > 0 ? (
                      <div className="border rounded-lg divide-y">
                        {affiliateStats.referrals.map((referral) => (
                          <div
                            key={referral.id}
                            className="p-4 flex justify-between items-center"
                          >
                            <div>
                              <div className="font-medium">
                                Referral #{referral.id}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {new Date(
                                  referral.createdAt
                                ).toLocaleDateString()}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-medium">
                                ${Number(referral.commissionAmount).toFixed(2)}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {referral.status}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        No referrals yet
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>How it works</Label>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>Share your unique affiliate link with others</li>
                      <li>
                        Earn 50% commission on all payments from referred users
                      </li>
                      <li>
                        Payments are processed automatically through Stripe
                      </li>
                      <li>Get paid when your referrals make a payment</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="font-medium">Become an Affiliate</h3>
                    <p className="text-sm text-muted-foreground">
                      Join our affiliate program to earn money by referring new
                      users to RWB Bets.
                    </p>
                  </div>

                  <Button
                    onClick={handleBecomeAffiliate}
                    disabled={becomingAffiliate}
                  >
                    {becomingAffiliate
                      ? "Setting up your account..."
                      : "Become an Affiliate"}
                  </Button>

                  <div className="space-y-2">
                    <Label>Requirements</Label>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>Click "Become an Affiliate" to get started</li>
                      <li>Complete the Stripe Connect onboarding process</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <Label>Affiliate Program Perks</Label>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>
                        50% commission on all payments from your referred users
                      </li>
                      <li>Instant payouts through Stripe Connect</li>
                    </ul>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button variant="outline" onClick={handleLogout}>
              Logout
            </Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
