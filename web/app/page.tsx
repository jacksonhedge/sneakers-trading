import { TopChrome } from "@/components/TopChrome";
import { LeftPanel } from "@/components/LeftPanel";
import { CenterPanel } from "@/components/CenterPanel";
import { RightPanel } from "@/components/RightPanel";
import { BottomBar } from "@/components/BottomBar";

export default function Page() {
  return (
    <div className="h-screen flex flex-col bg-bg-base">
      <TopChrome />
      <main className="flex-1 min-h-0 flex">
        <LeftPanel />
        <CenterPanel />
        <RightPanel />
      </main>
      <BottomBar />
    </div>
  );
}
