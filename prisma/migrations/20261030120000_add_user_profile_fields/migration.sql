ALTER TABLE "User"
ADD COLUMN "username" VARCHAR(30),
ADD COLUMN "description" VARCHAR(1000) NOT NULL DEFAULT '',
ADD COLUMN "pronouns" VARCHAR(100) NOT NULL DEFAULT '',
ADD COLUMN "profilePhoto" BYTEA;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");