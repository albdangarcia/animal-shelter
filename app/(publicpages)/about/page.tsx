import Card from "@/components/public-pages/aboutUs/card";
import PageHeader from "@/components/public-pages/aboutUs/page-header";
import PageLayout from "@/components/public-pages/aboutUs/page-layout";

const locations = [
  { location: "New York", address: "742 Evergreen Terrace", state: "New York, NY 10001" },
  { location: "San Francisco", address: "1600 Holloway Avenue", state: "San Francisco, CA 94132" },
  { location: "Chicago", address: "233 South Wacker Drive", state: "Chicago, IL 60606" },
  { location: "Austin", address: "5000 Burnet Road", state: "Austin, TX 78756" },
];

const Page = () => {
  return (
    <PageLayout>
      <div className="mb-10">
        <PageHeader
          title="About Us"
          description="Welcome to PetAdopt, where compassion meets purpose. Our mission is simple yet profound: to provide a safe haven for animals in need, offering them refuge, care, and a second chance at a loving home. Join us in our journey to create a world where every paw print leaves a trail of hope."
        />
      </div>

      <PageHeader title="Our Locations" as="section" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {locations.map((loc, index) => (
          <Card key={index} title={loc.location}>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {loc.address}
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {loc.state}
            </p>
          </Card>
        ))}
      </div>
    </PageLayout>
  );
};

export default Page;