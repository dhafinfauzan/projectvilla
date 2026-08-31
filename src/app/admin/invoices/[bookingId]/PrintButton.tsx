"use client";

export default function PrintButton() {
  return <button onClick={() => window.print()} className="print:hidden border border-[#244c38] px-4 py-2 text-xs font-semibold tracking-[0.1em] text-[#244c38] uppercase">Print / save PDF</button>;
}
