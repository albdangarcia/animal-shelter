import StatusPage from "../../../components/StatusPage";

const Page = () => {
  return (
    <StatusPage
      type="notFound"
      itemName="Pet"
      buttonGoTo="Pets"
      redirectUrl="/pets"
    />
  );
};

export default Page;
