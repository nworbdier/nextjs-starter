"use client";

import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/utils/firebaseConfig";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";

export function NavSidebar() {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/");
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  const menuItems = [];

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle navigation menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[300px] sm:w-[300px]">
        <SheetHeader className="mb-6 text-left">
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col space-y-3">
          {menuItems.map((item) => (
            <SheetClose key={item.label} asChild>
              <Button
                variant="ghost"
                className="w-full justify-start text-lg font-medium"
                onClick={item.onClick}
              >
                {item.label}
              </Button>
            </SheetClose>
          ))}
          <SheetClose asChild>
            <Button
              variant="ghost"
              className="w-full justify-start text-lg font-medium text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={handleLogout}
            >
              Logout
            </Button>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}
