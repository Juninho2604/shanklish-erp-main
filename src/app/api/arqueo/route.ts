import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSalesForArqueoAction } from '@/app/actions/sales.actions';
import { buildArqueoWorkbookFromTemplate, getArqueoFileName } from '@/lib/arqueo-excel-utils';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const dateParam = searchParams.get('date');
        const date = dateParam ? new Date(dateParam + 'T12:00:00') : new Date();

        const result = await getSalesForArqueoAction(date);
        if (!result.success || !result.data) {
            return NextResponse.json(
                { error: result.message || 'Error generando arqueo' },
                { status: 500 }
            );
        }

        const buffer = await buildArqueoWorkbookFromTemplate(result.data);

        const dateStr = date.toLocaleDateString('es-VE');
        const fileName = getArqueoFileName(dateStr);
        const encodedFileName = encodeURIComponent(fileName);

        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${encodedFileName}`,
            },
        });
    } catch (error) {
        console.error('Error exporting arqueo:', error);
        return NextResponse.json(
            { error: 'Error interno al exportar arqueo' },
            { status: 500 }
        );
    }
}
