"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { auth } from "./firebaseConfig";
import { onAuthStateChanged, signOut } from "firebase/auth";
import Cookies from "js-cookie";

const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        if (firebaseUser) {
          try {
            // Get the ID token
            const token = await firebaseUser.getIdToken();

            // Set the token cookie
            Cookies.set("token", token, { secure: true, sameSite: "strict" });

            // Fetch user data from our database
            const response = await fetch("/api/user", {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });

            if (response.ok) {
              const dbUser = await response.json();
              // Combine Firebase and database user data
              setUser({
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.displayName,
                photoURL: firebaseUser.photoURL,
                pro_access: dbUser.pro_access || false,
              });
            } else {
              // Get error details from response
              const errorData = await response.json();
              console.error("User data fetch failed:", {
                status: response.status,
                statusText: response.statusText,
                error: errorData,
              });
              throw new Error(
                `Failed to fetch user data: ${
                  errorData.error || response.statusText
                }`
              );
            }
          } catch (error) {
            console.error("Error fetching user data:", error);
            setError(error.message);
          }
        } else {
          setUser(null);
          // Remove the token cookie when user is not authenticated
          Cookies.remove("token");
        }
        setLoading(false);
      },
      (error) => {
        setError(error.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      // Remove the token cookie on sign out
      Cookies.remove("token");
    } catch (error) {
      setError(error.message);
    }
  };

  // Add a function to refresh user data
  const refreshUser = async () => {
    if (!auth.currentUser) return;

    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch("/api/user", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const dbUser = await response.json();
        setUser((prev) => ({
          ...prev,
          pro_access: dbUser.pro_access || false,
        }));
      }
    } catch (error) {
      console.error("Error refreshing user data:", error);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, error, signOut: handleSignOut, refreshUser }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
