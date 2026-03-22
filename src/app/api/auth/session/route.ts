import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await getSession();

        if (!session) {
            return NextResponse.json({ user: null });
        }

        return NextResponse.json({
            user: {
                id: session.id,
                email: session.email,
                firstName: session.firstName,
                lastName: session.lastName,
                role: session.role,
            }
        });
    } catch (error) {
        console.error('Error getting session:', error);
        return NextResponse.json({ user: null });
    }
}
