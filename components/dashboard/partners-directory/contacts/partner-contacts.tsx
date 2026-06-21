"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Mail, Phone, Star } from "lucide-react";
import Link from "next/link";
import { PartnerContactsPayload, LinkablePersonPayload } from "@/app/lib/types";
import { PartnerContactForm } from "./partner-contact-form";
import { ContactActions } from "./contact-row-actions";

const INITIAL_DISPLAY_COUNT = 10;

interface Props {
  contacts: PartnerContactsPayload[];
  people: LinkablePersonPayload[];
  partnerId: string;
  canManage: boolean;
}

const PartnerContacts = ({
  contacts,
  people,
  partnerId,
  canManage,
}: Props) => {
  const [showAll, setShowAll] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const visibleContacts = showAll
    ? contacts
    : contacts.slice(0, INITIAL_DISPLAY_COUNT);

  const hasMore = contacts.length > INITIAL_DISPLAY_COUNT;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Contacts</CardTitle>

        <CardDescription>
          People linked to this partner as points of contact.
        </CardDescription>

        <CardAction>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant={canManage ? "default" : "outline"}
                size="sm"
                className="disabled:pointer-events-auto disabled:cursor-not-allowed"
                disabled={!canManage}
              >
                Add Contact
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Add Contact</DialogTitle>
                <DialogDescription>
                  Link a person to this partner as a point of contact.
                </DialogDescription>
              </DialogHeader>
              <PartnerContactForm
                partnerId={partnerId}
                people={people}
                onFormSubmit={() => setIsAddDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </CardAction>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          {visibleContacts.length > 0 ? (
            visibleContacts.map((contact) => (
              <div
                key={contact.id}
                className={clsx(
                  "border rounded-lg p-4 relative group",
                  !contact.isActive && "opacity-60",
                )}
              >
                {canManage && (
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ContactActions
                      contact={contact}
                      people={people}
                      partnerId={partnerId}
                    />
                  </div>
                )}

                <div className="flex items-start gap-4">
                  <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg border bg-secondary text-2xl">
                    👤
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Link
                        href={`/dashboard/people-directory/${contact.person.id}`}
                        className="font-medium hover:underline"
                      >
                        {contact.person.name}
                      </Link>
                      {contact.isPrimary && (
                        <Badge
                          variant="outline"
                          className="font-semibold bg-amber-100 text-amber-800 border-amber-200"
                        >
                          <Star className="mr-1 h-3 w-3" />
                          Primary
                        </Badge>
                      )}
                      {!contact.isActive && (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </div>

                    {contact.role && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {contact.role}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                      {contact.person.email && (
                        <span className="flex items-center gap-1 break-all">
                          <Mail className="h-3 w-3" />
                          {contact.person.email}
                        </span>
                      )}
                      {contact.person.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {contact.person.phone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center text-gray-500 py-12 border-2 border-dashed rounded-lg">
              <p className="font-semibold text-lg">No Contacts Found</p>

              <p className="text-sm mt-1">
                This partner has no linked contacts yet.
              </p>
            </div>
          )}
        </div>
      </CardContent>

      {hasMore && (
        <CardFooter className="justify-center">
          <Button variant="outline" onClick={() => setShowAll((prev) => !prev)}>
            {showAll
              ? "Show Less"
              : `Show ${contacts.length - INITIAL_DISPLAY_COUNT} More`}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
};

export default PartnerContacts;