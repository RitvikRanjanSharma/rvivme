"use client";

// app/auth/signout/page.tsx
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function SignOutPage() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.signOut().then(() => router.push("/auth/login"));
  }, [router]);

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", gap: "20px",
    }}>
      <div style={{
        width: "36px", height: "36px", borderRadius: "8px",
        background: "var(--brand)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 2L14 12H2L8 2Z" fill="white" fillOpacity="0.9"/>
        </svg>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
        <div style={{
          width: "20px", height: "20px",
          border: "2px solid var(--border)",
          borderTopColor: "var(--brand)",
          borderRadius: "50%",
          animation: "spin 0.7s linear infinite",
        }} />
        <span style={{
          fontFamily: "var(--font-mono)", fontSize: "11px",
          letterSpacing: "0.12em", textTransform: "uppercase",
          color: "var(--text-tertiary)",
        }}>
          Signing out
        </span>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
