import { Suspense } from "react";
import Confirmation from "./Confirmation";

export const metadata = {
  title: "Reservation Confirmation — The Taru Villas",
};

export default function ConfirmationPage() {
  return (
    <Suspense>
      <Confirmation />
    </Suspense>
  );
}
