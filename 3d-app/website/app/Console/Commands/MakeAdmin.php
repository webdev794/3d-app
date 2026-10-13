<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/** php artisan admin:create admin@example.com --name="Fabian" [--password=...] */
class MakeAdmin extends Command
{
    protected $signature = 'admin:create {email} {--name=Administrator} {--password=}';

    protected $description = 'Create an administrator, or give an existing user administrator access';

    public function handle(): int
    {
        $email = mb_strtolower(trim($this->argument('email')));
        $user = User::firstWhere('email', $email);
        $password = $this->option('password');
        if (! $user) {
            $password = $password ?: Str::password(16, symbols: false);
            $user = new User(['name' => $this->option('name'), 'email' => $email, 'password' => $password]);
        } elseif ($password) {
            $user->password = $password;
        }
        $user->is_admin = true;
        $user->save();
        $this->info("{$email} is an administrator.".($password ? " Password: {$password}" : ''));

        return self::SUCCESS;
    }
}
