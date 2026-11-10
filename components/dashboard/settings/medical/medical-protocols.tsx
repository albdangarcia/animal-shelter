"use client";

import { clsx } from "clsx";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HelpLink } from "@/components/dashboard/help/help-link";
import type { HelpLinkGuide } from "@/app/lib/guides/help-paths";
import type {
  MedicalProtocolListing,
  ProtocolStepItem,
} from "@/app/lib/data/medical-protocol";
import {
  protocolAgesText,
  protocolStepIssueText,
  protocolStepName,
  protocolStepTimingText,
} from "@/app/lib/utils/medical-protocol-text";
import {
  AddMedicalProtocolButton,
  MedicalProtocolActions,
} from "./medical-protocol-actions";

interface Props {
  protocols: MedicalProtocolListing[];
  species: { id: string; name: string }[];
  items: ProtocolStepItem[];
  /** The guide the "?" opens, or null for no "?". */
  help: HelpLinkGuide | null;
}

/** The protocols of each species, in the order they are listed. */
const bySpecies = (protocols: MedicalProtocolListing[]) => {
  const groups = new Map<string, { name: string; protocols: MedicalProtocolListing[] }>();
  for (const protocol of protocols) {
    const group = groups.get(protocol.speciesId) ?? {
      name: protocol.speciesName,
      protocols: [],
    };
    group.protocols.push(protocol);
    groups.set(protocol.speciesId, group);
  }
  return [...groups.entries()];
};

const MedicalProtocols = ({ protocols, species, items, help }: Props) => {
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="@[650px]/card:text-xl">Medical Protocols</CardTitle>
        <CardDescription>
          The care an animal is scheduled when it arrives, by its species and
          its age on the intake day. A change applies to animals admitted
          afterwards; care already scheduled stays as it was.
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          <HelpLink guide={help} />
          <AddMedicalProtocolButton species={species} items={items} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {bySpecies(protocols).map(([speciesId, group]) => (
            <section
              key={speciesId}
              aria-label={group.name}
              className="border rounded-lg p-4 bg-card"
            >
              <h4 className="font-medium mb-3 text-foreground">{group.name}</h4>
              <ul className="divide-y">
                {group.protocols.map((protocol) => (
                  <li
                    key={protocol.id}
                    className={clsx(
                      "flex items-start justify-between gap-2 py-3",
                      protocol.retired && "opacity-60",
                    )}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{protocol.name}</span>
                        {protocol.retired && <Badge variant="outline">Retired</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {protocolAgesText(
                          protocol.speciesName,
                          protocol.minAgeDays,
                          protocol.maxAgeDays,
                        )}
                      </p>
                      <ol className="space-y-1 text-sm">
                        {protocol.steps.map((step) => {
                          const issue = protocol.retired
                            ? null
                            : protocolStepIssueText(step, protocol.speciesId);
                          return (
                            <li key={step.id} className="break-words">
                              <span className="font-medium">
                                {protocolStepName(step)}
                              </span>
                              {" · "}
                              {protocolStepTimingText(step)}
                              {step.notes && (
                                <span className="block text-muted-foreground">
                                  {step.notes}
                                </span>
                              )}
                              {issue && (
                                <span className="block text-destructive">
                                  {issue.charAt(0).toUpperCase() + issue.slice(1)}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                    <MedicalProtocolActions
                      protocol={protocol}
                      species={species}
                      items={items}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {protocols.length === 0 && (
            <div className="text-center py-8 px-4 border-2 border-dashed rounded-lg">
              <p className="text-muted-foreground text-sm">
                No protocols yet. Add one to schedule care for the animals of
                a species when they arrive.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default MedicalProtocols;
