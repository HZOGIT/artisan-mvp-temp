// Forge un JWT d'authentification (HS256, claims {userId,email}) signé avec JWT_SECRET — le MÊME
// secret/format que le legacy et le nouveau stack (cookie `token`). Usage smoke uniquement :
//   JWT_SECRET=… node scripts/mint-jwt.mjs <userId> <email>
import { SignJWT } from "jose";

const [, , userIdArg, email] = process.argv;
const userId = Number(userIdArg);
const secret = process.env.JWT_SECRET;
if (!secret || !Number.isInteger(userId) || !email) {
  console.error("usage: JWT_SECRET=… node scripts/mint-jwt.mjs <userId> <email>");
  process.exit(2);
}

const token = await new SignJWT({ userId, email })
  .setProtectedHeader({ alg: "HS256" })
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(secret));

process.stdout.write(token);
