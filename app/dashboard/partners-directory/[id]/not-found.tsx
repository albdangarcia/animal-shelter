import StatusPage from "@/components/StatusPage";

const Page = () => {
  return (
    <StatusPage
      type="notFound"
      itemName="Partner"
      buttonGoTo="Partner Directory"
      redirectUrl="/dashboard/partners-directory"
    />
  );
};

export default Page;
