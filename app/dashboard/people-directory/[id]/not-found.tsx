import PageNotFoundOrAccessDenied from "@/components/PageNotFoundOrAccessDenied";

const Page = () => {
  return (
    <PageNotFoundOrAccessDenied
      type="notFound"
      itemName="Person"
      buttonGoTo="People Directory"
      redirectUrl="/dashboard/people-directory"
    />
  );
};

export default Page;