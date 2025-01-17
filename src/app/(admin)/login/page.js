"use client";
import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/utils/firebaseConfig";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
} from "firebase/auth";
import { LoginForm } from "@/components/login-form";
import { useAuth } from "@/utils/authContext";
import { useToast } from "@/hooks/use-toast";

const LoginPage = () => {
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Redirect if already logged in
  React.useEffect(() => {
    if (user && !loading) {
      router.refresh();
      router.push("/");
    }
  }, [user, router, loading]);

  const handleSuccessfulAuth = useCallback(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // Wait a brief moment for auth state to fully propagate
        setTimeout(() => {
          router.refresh();
          router.push("/");
        }, 500);
      }
      unsubscribe();
    });
  }, [router]);

  const handleLogin = useCallback(async () => {
    try {
      setIsLoading(true);

      await signInWithEmailAndPassword(auth, email, password);
      toast({
        title: "Success",
        description: "Successfully logged in",
      });
      handleSuccessfulAuth();
    } catch (error) {
      let description = "An unexpected error occurred";

      switch (error.code) {
        case "auth/invalid-credential":
          description = "Invalid email or password. Please try again.";
          break;
        case "auth/user-not-found":
          description = "No account found with this email.";
          break;
        case "auth/wrong-password":
          description = "Incorrect password.";
          break;
        case "auth/invalid-email":
          description = "Invalid email format.";
          break;
        case "auth/user-disabled":
          description = "This account has been disabled.";
          break;
        default:
          description = error.message;
      }

      toast({
        title: "Login Failed",
        description,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [email, password, handleSuccessfulAuth, toast]);

  const handleGoogleLogin = useCallback(async () => {
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
        description: "Successfully logged in with Google",
      });
      handleSuccessfulAuth();
    } catch (error) {
      let description = "Failed to Login with Google";

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
          description = `Google sign-in failed: ${error.message}`;
      }

      toast({
        title: "Google Login Failed",
        description,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [handleSuccessfulAuth, toast]);

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] py-16">
      <LoginForm
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        isLoading={isLoading}
        handleLogin={handleLogin}
        handleGoogleLogin={handleGoogleLogin}
      />
    </div>
  );
};

export default LoginPage;
