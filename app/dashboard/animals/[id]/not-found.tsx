import StatusPage from "@/components/StatusPage";

const Page = () => {
  return (
    <StatusPage
      type="notFound"
      itemName="Animal"
      buttonGoTo="Animals"
      redirectUrl="/dashboard/animals"
    />
  );
};

export default Page;
