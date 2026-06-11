import { Suspense } from "react";
import BookingFlow from "./BookingFlow";

export const metadata = {
  title: "Reserve Your Stay — The Taru Villas",
};

export default function BookingPage() {
  return (
    <Suspense>
      <BookingFlow />
    </Suspense>
  );
}
