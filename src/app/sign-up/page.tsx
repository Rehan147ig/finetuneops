import { SignUpForm } from "@/components/auth/sign-up-form";
import { findActiveInviteByToken } from "@/lib/invitations";

type SignUpPageProps = {
  searchParams: Promise<{
    invite?: string;
  }>;
};

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = await searchParams;
  const invite = params.invite ? await findActiveInviteByToken(params.invite) : null;

  return (
    <SignUpForm
      inviteToken={invite?.token}
      inviteEmail={invite?.email}
      organizationName={invite?.organization.name}
    />
  );
}
