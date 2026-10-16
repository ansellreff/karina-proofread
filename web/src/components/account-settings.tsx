import { LogOut } from "lucide-react";
import { Section } from "@/components/rules/bits";
import { Button } from "@/components/ui/button";

/** Settings → Account (online only): sign this device out. */
export function AccountSection() {
  return (
    <Section title="Account" hint="This device stays signed in for 30 days. Sign out on a computer that isn’t yours.">
      <form method="post" action="/api/auth/logout">
        <Button size="sm" variant="outline" type="submit">
          <LogOut /> Sign out of this device
        </Button>
      </form>
    </Section>
  );
}
