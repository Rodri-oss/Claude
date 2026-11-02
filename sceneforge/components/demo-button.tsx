'use client';
import { useRouter } from 'next/navigation';
import { ActionButton } from './ui';

export function DemoProjectButton() {
  const router = useRouter();
  return (
    <ActionButton action="demo.createProject" refresh={false} success="Demo project created from the demo library" onDone={(d) => router.push(`/projects/${(d as { projectId: string }).projectId}/story`)}>
      Create demo project
    </ActionButton>
  );
}
