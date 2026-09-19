import StatusPage from "@/components/StatusPage";

const Page = () => {
  return (
    <StatusPage
      type="notFound"
      buttonGoTo="Dashboard"
      redirectUrl="/dashboard"
    />
  );
};

export default Page;
