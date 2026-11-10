import StatusPage from "@/components/StatusPage";

// The same page for a guide that doesn't exist and one the reader can't see.
export default function NotFound() {
  return (
    <StatusPage
      type="notFound"
      itemName="Guide"
      redirectUrl="/dashboard/help"
      buttonGoTo="Help"
    />
  );
}
