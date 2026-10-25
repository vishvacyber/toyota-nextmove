"use client";
import { notFound, useParams } from "next/navigation";
import { DataView } from "@/components/data-view";
import { NAV } from "@/lib/nav";

export default function Page() {
  const { slug } = useParams<{ slug?: string[] }>();
  const page = NAV.find((p) => p.slug === (slug?.join("/") ?? ""));
  if (!page) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{page.title}</h1>
      {page.endpoints.map((e) => <DataView key={e} endpoint={e} />)}
    </div>
  );
}
