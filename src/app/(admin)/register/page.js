"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/utils/firebaseConfig";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
} from "firebase/auth";
import { RegisterForm } from "@/components/register-form";
import { useToast } from "@/hooks/use-toast";

const RegisterPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSuccessfulAuth = React.useCallback(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Wait a brief moment for auth state to fully propagate
        setTimeout(() => {
          router.refresh();
          router.push("/projections");
        }, 500);
      }
      unsubscribe();
    });
  }, [router]);

  const handleGoogleRegister = React.useCallback(async () => {
    try {
      setIsLoading(true);
      const provider = new GoogleAuthProvider();
      provider.addScope("email");
      provider.addScope("profile");

      provider.setCustomParameters({
        prompt: "select_account",
      });

      await signInWithPopup(auth, provider);
      toast({
        title: "Success",
        description: "Successfully registered with Google",
      });
      handleSuccessfulAuth();
    } catch (error) {
      console.error("Google registration error:", error);
      let description = "Failed to register with Google";

      switch (error.code) {
        case "auth/popup-closed-by-user":
          description = "Sign-in was cancelled";
          break;
        case "auth/popup-blocked":
          description = "Sign-in popup was blocked by your browser";
          break;
        case "auth/cancelled-popup-request":
          description = "Another sign-in attempt is in progress";
          break;
        case "auth/unauthorized-domain":
          description = "This domain is not authorized for Google sign-in";
          break;
        default:
          description = error.message;
      }

      toast({
        title: "Registration Failed",
        description,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [handleSuccessfulAuth, toast]);

  const handleRegister = React.useCallback(async () => {
    if (!password || !confirmPassword) {
      toast({
        title: "Validation Error",
        description: "Please fill in both password fields",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "Validation Error",
        description: "Passwords do not match. Please try again.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      try {
        await sendEmailVerification(userCredential.user, {
          url: `${window.location.origin}/login`,
          handleCodeInApp: false,
        });
      } catch (verificationError) {
        toast({
          title: "Warning",
          description:
            "Account created but verification email failed to send. Please try resending from settings.",
          variant: "warning",
        });
      }

      toast({
        title: "Registration successful!",
        description: "Please check your email to verify your account.",
      });

      handleSuccessfulAuth();
    } catch (error) {
      let description = "An unexpected error occurred during registration";

      switch (error.code) {
        case "auth/email-already-in-use":
          description = "This email is already registered.";
          break;
        case "auth/invalid-email":
          description = "Please enter a valid email address.";
          break;
        case "auth/operation-not-allowed":
          description = "Email/password registration is not enabled.";
          break;
        case "auth/weak-password":
          description = "Password is too weak. Please use a stronger password.";
          break;
        case "auth/network-request-failed":
          description = "Network error. Please check your internet connection.";
          break;
        default:
          description = error.message;
      }

      toast({
        title: "Registration Failed",
        description,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [email, password, confirmPassword, toast, handleSuccessfulAuth]);

  return (
    <div className="container mx-auto flex items-center justify-center px-4 py-16">
      <RegisterForm
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        confirmPassword={confirmPassword}
        setConfirmPassword={setConfirmPassword}
        isLoading={isLoading}
        handleRegister={handleRegister}
        handleGoogleRegister={handleGoogleRegister}
      />
    </div>
  );
};

export default RegisterPage;
