"use client";
import Link from "next/link";
import { Zap } from "lucide-react";
export default function NotFound() {
   return (
     <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:"20px", padding:"24px", textAlign:"center" }}>
      <div style={{ width:"48px", height:"48px", borderRadius:"12px", background:"linear-gradient(135deg,var(--brand),color-mix(in srgb,var(--brand) 55%,#000))", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 0 20px var(--brand-glow)" }}>
         <Zap size={22} color="#fff" strokeWidth={2.5} />
        </div>
        <div>
         <div style={{ fontFamily:"var(--font-dm-mono),monospace", fontSize:"64px", fontWeight:500, color:"var(--text-tertiary)", lineHeight:1, marginBottom:"8px" }}>404</div>
         <h1 style={{ fontFamily:"var(--font-syne),sans-serif", fontSize:"22px", fontWeight:800, color:"var(--text-primary)", letterSpacing:"-0.025em", marginBottom:"8px" }}>Page Not Found</h1>
         <p style={{ fontFamily:"var(--font-inter),sans-serif", fontSize:"14px", color:"var(--text-secondary)", maxWidth:"340px", lineHeight:1.7 }}>
           The requested route does not exist within the AI Marketing Labs platform.
        </p>
       </div>
       <Link href="/dashboard" style={{ fontFamily:"var(--font-inter),sans-serif", fontSize:"13px", fontWeight:600, color:"#fff", background:"linear-gradient(135deg,var(--brand),color-mix(in srgb,var(--brand) 60%,#000))", padding:"9px 20px", borderRadius:"8px", textDecoration:"none", boxShadow:"0 0 16px var(--brand-glow)" }}>
         Return to Dashboard
       </Link>
     </div>
   );
 }