import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" ADD COLUMN "last_edited_by_id" integer;
  ALTER TABLE "_pages_v" ADD COLUMN "version_last_edited_by_id" integer;
  ALTER TABLE "posts" ADD COLUMN "last_edited_by_id" integer;
  ALTER TABLE "_posts_v" ADD COLUMN "version_last_edited_by_id" integer;
  ALTER TABLE "organizations" ADD COLUMN "last_edited_by_id" integer;
  ALTER TABLE "_organizations_v" ADD COLUMN "version_last_edited_by_id" integer;
  ALTER TABLE "academic_years" ADD COLUMN "last_edited_by_id" integer;
  ALTER TABLE "_academic_years_v" ADD COLUMN "version_last_edited_by_id" integer;
  ALTER TABLE "offices" ADD COLUMN "last_edited_by_id" integer;
  ALTER TABLE "_offices_v" ADD COLUMN "version_last_edited_by_id" integer;
  ALTER TABLE "people" ADD COLUMN "last_edited_by_id" integer;
  ALTER TABLE "_people_v" ADD COLUMN "version_last_edited_by_id" integer;
  ALTER TABLE "activities" ADD COLUMN "last_edited_by_id" integer;
  ALTER TABLE "_activities_v" ADD COLUMN "version_last_edited_by_id" integer;
  ALTER TABLE "issuances" ADD COLUMN "last_edited_by_id" integer;
  ALTER TABLE "_issuances_v" ADD COLUMN "version_last_edited_by_id" integer;
  ALTER TABLE "reports" ADD COLUMN "last_edited_by_id" integer;
  ALTER TABLE "_reports_v" ADD COLUMN "version_last_edited_by_id" integer;
  ALTER TABLE "pages" ADD CONSTRAINT "pages_last_edited_by_id_users_id_fk" FOREIGN KEY ("last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_last_edited_by_id_users_id_fk" FOREIGN KEY ("version_last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" ADD CONSTRAINT "posts_last_edited_by_id_users_id_fk" FOREIGN KEY ("last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_last_edited_by_id_users_id_fk" FOREIGN KEY ("version_last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "organizations" ADD CONSTRAINT "organizations_last_edited_by_id_users_id_fk" FOREIGN KEY ("last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_organizations_v" ADD CONSTRAINT "_organizations_v_version_last_edited_by_id_users_id_fk" FOREIGN KEY ("version_last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_last_edited_by_id_users_id_fk" FOREIGN KEY ("last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_academic_years_v" ADD CONSTRAINT "_academic_years_v_version_last_edited_by_id_users_id_fk" FOREIGN KEY ("version_last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "offices" ADD CONSTRAINT "offices_last_edited_by_id_users_id_fk" FOREIGN KEY ("last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_offices_v" ADD CONSTRAINT "_offices_v_version_last_edited_by_id_users_id_fk" FOREIGN KEY ("version_last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "people" ADD CONSTRAINT "people_last_edited_by_id_users_id_fk" FOREIGN KEY ("last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_people_v" ADD CONSTRAINT "_people_v_version_last_edited_by_id_users_id_fk" FOREIGN KEY ("version_last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "activities" ADD CONSTRAINT "activities_last_edited_by_id_users_id_fk" FOREIGN KEY ("last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_activities_v" ADD CONSTRAINT "_activities_v_version_last_edited_by_id_users_id_fk" FOREIGN KEY ("version_last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "issuances" ADD CONSTRAINT "issuances_last_edited_by_id_users_id_fk" FOREIGN KEY ("last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_issuances_v" ADD CONSTRAINT "_issuances_v_version_last_edited_by_id_users_id_fk" FOREIGN KEY ("version_last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "reports" ADD CONSTRAINT "reports_last_edited_by_id_users_id_fk" FOREIGN KEY ("last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_reports_v" ADD CONSTRAINT "_reports_v_version_last_edited_by_id_users_id_fk" FOREIGN KEY ("version_last_edited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "pages_last_edited_by_idx" ON "pages" USING btree ("last_edited_by_id");
  CREATE INDEX "_pages_v_version_version_last_edited_by_idx" ON "_pages_v" USING btree ("version_last_edited_by_id");
  CREATE INDEX "posts_last_edited_by_idx" ON "posts" USING btree ("last_edited_by_id");
  CREATE INDEX "_posts_v_version_version_last_edited_by_idx" ON "_posts_v" USING btree ("version_last_edited_by_id");
  CREATE INDEX "organizations_last_edited_by_idx" ON "organizations" USING btree ("last_edited_by_id");
  CREATE INDEX "_organizations_v_version_version_last_edited_by_idx" ON "_organizations_v" USING btree ("version_last_edited_by_id");
  CREATE INDEX "academic_years_last_edited_by_idx" ON "academic_years" USING btree ("last_edited_by_id");
  CREATE INDEX "_academic_years_v_version_version_last_edited_by_idx" ON "_academic_years_v" USING btree ("version_last_edited_by_id");
  CREATE INDEX "offices_last_edited_by_idx" ON "offices" USING btree ("last_edited_by_id");
  CREATE INDEX "_offices_v_version_version_last_edited_by_idx" ON "_offices_v" USING btree ("version_last_edited_by_id");
  CREATE INDEX "people_last_edited_by_idx" ON "people" USING btree ("last_edited_by_id");
  CREATE INDEX "_people_v_version_version_last_edited_by_idx" ON "_people_v" USING btree ("version_last_edited_by_id");
  CREATE INDEX "activities_last_edited_by_idx" ON "activities" USING btree ("last_edited_by_id");
  CREATE INDEX "_activities_v_version_version_last_edited_by_idx" ON "_activities_v" USING btree ("version_last_edited_by_id");
  CREATE INDEX "issuances_last_edited_by_idx" ON "issuances" USING btree ("last_edited_by_id");
  CREATE INDEX "_issuances_v_version_version_last_edited_by_idx" ON "_issuances_v" USING btree ("version_last_edited_by_id");
  CREATE INDEX "reports_last_edited_by_idx" ON "reports" USING btree ("last_edited_by_id");
  CREATE INDEX "_reports_v_version_version_last_edited_by_idx" ON "_reports_v" USING btree ("version_last_edited_by_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" DROP CONSTRAINT "pages_last_edited_by_id_users_id_fk";
  
  ALTER TABLE "_pages_v" DROP CONSTRAINT "_pages_v_version_last_edited_by_id_users_id_fk";
  
  ALTER TABLE "posts" DROP CONSTRAINT "posts_last_edited_by_id_users_id_fk";
  
  ALTER TABLE "_posts_v" DROP CONSTRAINT "_posts_v_version_last_edited_by_id_users_id_fk";
  
  ALTER TABLE "organizations" DROP CONSTRAINT "organizations_last_edited_by_id_users_id_fk";
  
  ALTER TABLE "_organizations_v" DROP CONSTRAINT "_organizations_v_version_last_edited_by_id_users_id_fk";
  
  ALTER TABLE "academic_years" DROP CONSTRAINT "academic_years_last_edited_by_id_users_id_fk";
  
  ALTER TABLE "_academic_years_v" DROP CONSTRAINT "_academic_years_v_version_last_edited_by_id_users_id_fk";
  
  ALTER TABLE "offices" DROP CONSTRAINT "offices_last_edited_by_id_users_id_fk";
  
  ALTER TABLE "_offices_v" DROP CONSTRAINT "_offices_v_version_last_edited_by_id_users_id_fk";
  
  ALTER TABLE "people" DROP CONSTRAINT "people_last_edited_by_id_users_id_fk";
  
  ALTER TABLE "_people_v" DROP CONSTRAINT "_people_v_version_last_edited_by_id_users_id_fk";
  
  ALTER TABLE "activities" DROP CONSTRAINT "activities_last_edited_by_id_users_id_fk";
  
  ALTER TABLE "_activities_v" DROP CONSTRAINT "_activities_v_version_last_edited_by_id_users_id_fk";
  
  ALTER TABLE "issuances" DROP CONSTRAINT "issuances_last_edited_by_id_users_id_fk";
  
  ALTER TABLE "_issuances_v" DROP CONSTRAINT "_issuances_v_version_last_edited_by_id_users_id_fk";
  
  ALTER TABLE "reports" DROP CONSTRAINT "reports_last_edited_by_id_users_id_fk";
  
  ALTER TABLE "_reports_v" DROP CONSTRAINT "_reports_v_version_last_edited_by_id_users_id_fk";
  
  DROP INDEX "pages_last_edited_by_idx";
  DROP INDEX "_pages_v_version_version_last_edited_by_idx";
  DROP INDEX "posts_last_edited_by_idx";
  DROP INDEX "_posts_v_version_version_last_edited_by_idx";
  DROP INDEX "organizations_last_edited_by_idx";
  DROP INDEX "_organizations_v_version_version_last_edited_by_idx";
  DROP INDEX "academic_years_last_edited_by_idx";
  DROP INDEX "_academic_years_v_version_version_last_edited_by_idx";
  DROP INDEX "offices_last_edited_by_idx";
  DROP INDEX "_offices_v_version_version_last_edited_by_idx";
  DROP INDEX "people_last_edited_by_idx";
  DROP INDEX "_people_v_version_version_last_edited_by_idx";
  DROP INDEX "activities_last_edited_by_idx";
  DROP INDEX "_activities_v_version_version_last_edited_by_idx";
  DROP INDEX "issuances_last_edited_by_idx";
  DROP INDEX "_issuances_v_version_version_last_edited_by_idx";
  DROP INDEX "reports_last_edited_by_idx";
  DROP INDEX "_reports_v_version_version_last_edited_by_idx";
  ALTER TABLE "pages" DROP COLUMN "last_edited_by_id";
  ALTER TABLE "_pages_v" DROP COLUMN "version_last_edited_by_id";
  ALTER TABLE "posts" DROP COLUMN "last_edited_by_id";
  ALTER TABLE "_posts_v" DROP COLUMN "version_last_edited_by_id";
  ALTER TABLE "organizations" DROP COLUMN "last_edited_by_id";
  ALTER TABLE "_organizations_v" DROP COLUMN "version_last_edited_by_id";
  ALTER TABLE "academic_years" DROP COLUMN "last_edited_by_id";
  ALTER TABLE "_academic_years_v" DROP COLUMN "version_last_edited_by_id";
  ALTER TABLE "offices" DROP COLUMN "last_edited_by_id";
  ALTER TABLE "_offices_v" DROP COLUMN "version_last_edited_by_id";
  ALTER TABLE "people" DROP COLUMN "last_edited_by_id";
  ALTER TABLE "_people_v" DROP COLUMN "version_last_edited_by_id";
  ALTER TABLE "activities" DROP COLUMN "last_edited_by_id";
  ALTER TABLE "_activities_v" DROP COLUMN "version_last_edited_by_id";
  ALTER TABLE "issuances" DROP COLUMN "last_edited_by_id";
  ALTER TABLE "_issuances_v" DROP COLUMN "version_last_edited_by_id";
  ALTER TABLE "reports" DROP COLUMN "last_edited_by_id";
  ALTER TABLE "_reports_v" DROP COLUMN "version_last_edited_by_id";`)
}
