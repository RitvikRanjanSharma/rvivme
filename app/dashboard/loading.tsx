export default function Loading() {
   return (
     <div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center" }}>
       <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"14px" }}>
         <div style={{ width:"32px", height:"32px", border:"2px solid var(--border)", borderTopColor:"var(--brand)", borderRadius:"50%", animation:"spin 0.7s linear infinite" }}/>
         <span style={{ fontFamily:"var(--font-dm-mono),monospace", fontSize:"10px", color:"var(--text-tertiary)", letterSpacing:"0.12em", textTransform:"uppercase" }}>Loading</span>
       </div>
       <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
     </div>
   );
 }