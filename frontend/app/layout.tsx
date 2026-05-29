import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/lib/providers";
import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider } from "@/lib/toast";

export const metadata: Metadata = {
  title: "MIC ACE — Affiliate Hub",
  description: "Quản lý affiliate program — crawl, profile, tuyển chọn & tự động đăng ký.",
  icons: { icon: "/logo.jpg", apple: "/logo.jpg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <Providers>
          <AuthProvider>
            <ToastProvider>{children}</ToastProvider>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
