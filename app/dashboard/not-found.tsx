import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";

const Page = () => {
  return (
    <PageNotFoundOrAccessDenied
      type="notFound"
      buttonGoTo="Dashboard"
      redirectUrl="/dashboard"
    />
  );
};

export default Page;
