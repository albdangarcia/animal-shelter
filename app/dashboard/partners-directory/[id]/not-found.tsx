import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";

const Page = () => {
  return (
    <PageNotFoundOrAccessDenied
      type="notFound"
      itemName="Partner"
      buttonGoTo="Partner Directory"
      redirectUrl="/dashboard/partners-directory"
    />
  );
};

export default Page;
