ALTER TABLE "User"
ADD COLUMN "username" VARCHAR(30),
ADD COLUMN "profilePhoto" BYTEA;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");