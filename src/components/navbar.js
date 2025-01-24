"use client";

import Link from "next/link";
import { useAuth } from "@/utils/authContext";
import { Button } from "@/components/ui/button";
import { NavSidebar } from "@/components/nav-sidebar";

export function Navbar() {
  const { user } = useAuth();

  return (
    <nav className="border-b">
      <div className="container mx-auto h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center space-x-8">
          <Link href="/projections" className="text-xl font-bold">
            AMCE
          </Link>
        </div>
        <div className="flex items-center space-x-4">
          {user ? (
            <NavSidebar />
          ) : (
            <div className="flex items-center space-x-2">
              <Link href="/login">
                <Button variant="ghost" className="text-sm">
                  Login
                </Button>
              </Link>
              <Link href="/register">
                <Button className="text-sm">Register</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
