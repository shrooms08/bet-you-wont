import { notFound } from "next/navigation";
import { MotionGallery } from "@/components/dev/MotionGallery";

// /dev/motion: demos every animation for review. Development only (404 in production).
export default function MotionPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <MotionGallery />;
}
