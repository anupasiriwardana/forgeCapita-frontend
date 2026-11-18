"use client";

import { RepoSection } from "@/components/founder/RepoSection";

export default function FounderRepositoryPage() {
  return (
    <>
      <div className="page-title-row">
        <div>
          <h1>Project repository</h1>
          <p>Your project code lives in a ForgeCapita-created GitHub repository. Each repository belongs to one project.</p>
        </div>
      </div>
      <RepoSection />
    </>
  );
}
