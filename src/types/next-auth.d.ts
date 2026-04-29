import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      organizationId: string;
      role: string;
      workspaceSlug: string;
    };
  }

  interface User {
    role?: string;
    organizationId?: string;
    workspaceSlug?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    organizationId?: string;
    workspaceSlug?: string;
  }
}
