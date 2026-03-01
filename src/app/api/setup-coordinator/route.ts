import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const { authUserId, email, fullName } = await request.json();

    // Check if coordinator already exists
    const { data: existing } = await supabase
      .from('coordinators')
      .select('id')
      .eq('auth_user_id', authUserId)
      .single();

    if (existing) {
      return NextResponse.json({ coordinator: existing });
    }

    // Link to the demo practice
    const practiceId = 'a1000000-0000-0000-0000-000000000001';

    const { data, error } = await supabase.from('coordinators').insert({
      auth_user_id: authUserId,
      practice_id: practiceId,
      full_name: fullName || 'Care Coordinator',
      email: email,
    }).select().single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ coordinator: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
