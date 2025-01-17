import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/utils/authContext";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { CSPostHogProvider } from "@/utils/posthog";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "AMCE",
  description: "CHANGE THIS",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="icon" href="/favicon.ICO" sizes="any" />
      </head>
      <CSPostHogProvider>
        <body className={`${inter.className} min-h-full flex flex-col`}>
          <AuthProvider>
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
            <Toaster />
          </AuthProvider>
        </body>
      </CSPostHogProvider>
    </html>
  );
}
