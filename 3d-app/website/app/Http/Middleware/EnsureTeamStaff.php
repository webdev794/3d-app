<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** 3DEEZI TEAM's staff API: administrators and designers. */
class EnsureTeamStaff
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        abort_unless($user && ($user->is_admin || $user->is_designer), 403, 'Only 3DEEZI designers and administrators can open this.');

        return $next($request);
    }
}
