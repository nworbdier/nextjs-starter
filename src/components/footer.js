"use client";

import Link from "next/link";
import { useAuth } from "@/utils/authContext";

export function Footer() {
  const { user } = useAuth();

  return (
    <footer className="border-t mt-auto">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between">
          <div className="max-w-xs">
            <h3 className="font-semibold mb-3">Affiliate Hub</h3>
            <p className="text-sm text-muted-foreground mr-5">
              The universal marketplace for affiliate codes.
            </p>
          </div>
          {user && (
            <div>
              <h3 className="font-semibold mb-3 text-center">Navigation</h3>
              <ul className="space-y-2 text-right">
                <li>
                  <Link
                    href="/projections"
                    className="text-sm hover:text-primary"
                  >
                    Projections
                  </Link>
                </li>
                <li>
                  <Link href="/settings" className="text-sm hover:text-primary">
                    Settings
                  </Link>
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
      <div className="border-t">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-sm text-muted-foreground">
          <h1 className="text-sm text-center">© Affiliate Hub</h1>
          <h1 className="text-sm text-center mt-2">All rights reserved</h1>
        </div>
      </div>
    </footer>
  );
}
