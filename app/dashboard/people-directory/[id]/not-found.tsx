import StatusPage from "@/components/StatusPage";

const Page = () => {
  return (
    <StatusPage
      type="notFound"
      itemName="Person"
      buttonGoTo="People Directory"
      redirectUrl="/dashboard/people-directory"
    />
  );
};

export default Page;