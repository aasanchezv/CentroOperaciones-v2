import { notFound }          from 'next/navigation'
import { getPortalData }     from '@/app/actions/portal-actions'
import { PortalDashboard }   from './portal-dashboard'

interface Props {
  params: Promise<{ token: string }>
}

export default async function PortalPage({ params }: Props) {
  const { token } = await params
  const data = await getPortalData(token)

  if (!data) notFound()

  return <PortalDashboard data={data} />
}

export const dynamic = 'force-dynamic'
