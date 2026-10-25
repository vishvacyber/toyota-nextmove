import { NextMoveScreen } from "@/components/next-move-screen";

// `?id=CUST-…` is the signed-in customer, and the deep link a QR code encodes.
export default async function PhoneHome({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const { id } = await searchParams;
  return <NextMoveScreen customerId={typeof id === "string" && id ? id : undefined} />;
}
