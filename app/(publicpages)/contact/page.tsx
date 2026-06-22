import Card from "@/components/public-pages/aboutUs/card";
import PublicPageHeader from "@/components/public-pages/aboutUs/page-header";
import PageLayout from "@/components/public-pages/aboutUs/page-layout";
import { Mail, Phone } from "lucide-react";

const contactDetails = [
  {
    title: "Volunteer",
    email: "volunteer@example.com",
    phone: "+1 (555) 905-6789",
  },
  {
    title: "Donations",
    email: "donations@example.com",
    phone: "+1 (555) 905-7890",
  },
  {
    title: "Support",
    email: "support@example.com",
    phone: "+1 (555) 905-8901",
  },
  {
    title: "Feedback",
    email: "feedback@example.com",
    phone: "+1 (555) 905-9012",
  },
];

const Page = () => {
  return (
    <PageLayout>
      <PublicPageHeader
        title="Contact"
        description="Have questions or want to help? Reach out to us and be part of making a difference for animals in need."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
        {contactDetails.map((contact, index) => (
          <Card key={index} title={contact.title}>
            <a
              href={`mailto:${contact.email}`}
              className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors duration-150"
            >
              <Mail className="size-4 shrink-0" aria-hidden="true" />
              {contact.email}
            </a>
            <a
              href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 mt-2"
            >
              <Phone className="size-4 shrink-0" aria-hidden="true" />
              {contact.phone}
            </a>
          </Card>
        ))}
      </div>
    </PageLayout>
  );
};

export default Page;
