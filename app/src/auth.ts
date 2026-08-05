import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import GitHub from "next-auth/providers/github"
import { PrismaAdapter } from "@/lib/prisma-adapter"
import { prisma } from "@/lib/prisma"

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: PrismaAdapter(prisma),
  // DEV-20260610-0002: JWT sessions (signed cookie) so middleware can verify
  // signature + expiry via getToken(). The adapter still persists
  // users/accounts; the Session table is no longer used.
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/signin",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    // REV-20260512-061: removed allowDangerousEmailAccountLinking from GitHub.
    // GitHub email is not verified by default — auto-linking allows email-spoofing
    // account takeover. Google (verified email) keeps the flag; GitHub does not.
    GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub
        // Fetch role from database
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { role: true },
        })
        if (dbUser) {
          session.user.role = dbUser.role
        }
      }
      return session
    },
  },
})
