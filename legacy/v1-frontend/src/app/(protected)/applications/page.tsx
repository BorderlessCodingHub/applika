import ApplicationsClientSection from "@/features/applications/components/ApplicationsClientSection";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: 'Applications',
};

export default async function ApplicationsPage() {
  return <ApplicationsClientSection />;
}
