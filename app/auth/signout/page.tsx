"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Zap } from "lucide-react";

export default function SignOutPage() {
  const router = useRouter();

  useEffect(() => {
    async function signOut() {
      await supabase.auth.signOut();
      router.push("/auth/login");
    }
    signOut();
  }, [router]);

  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px",
    }}>
      <div style={{
        width: "40px", height: "40px", borderRadius: "10px",
        background: "linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 55%, #000))",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 16px var(--brand-glow)",
      }}>
        <Zap size={18} color="#fff" strokeWidth={2.5} />
      </div>
      <p style={{
        fontFamily: "var(--font-dm-mono), monospace", fontSize: "12px",
        color: "var(--text-tertiary)", letterSpacing: "0.1em", textTransform: "uppercase",
      }}>
        Signing out...
      </p>
    </div>
  );
}