package io.freemytv;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import java.io.IOException;

/**
 * The home screen's moon button: each press steps 30 → 60 → 90 → 120 minutes → off. When the time is up the TV goes
 * to standby through its own ADB, as the mode switches do.
 */
public final class SleepTimer extends BroadcastReceiver {
    private static final int[] STEPS = {30, 60, 90, 120};

    /** The next step after the one running (off after the last). Returns the minutes now set, 0 = off. */
    static int cycle(Context c) {
        int current = minutesLeft(c) > 0 ? sp(c).getInt("minutes", 0) : 0;
        int next = 0;
        for (int s : STEPS) {
            if (s > current) {
                next = s;
                break;
            }
        }
        set(c, next);
        return next;
    }

    /** Minutes until the TV turns off, rounded up; 0 = no timer. */
    static int minutesLeft(Context c) {
        long left = sp(c).getLong("at", 0) - System.currentTimeMillis();
        return left <= 0 ? 0 : (int) ((left + 59_999) / 60_000);
    }

    private static void set(Context c, int minutes) {
        long at = minutes == 0 ? 0 : System.currentTimeMillis() + minutes * 60_000L;
        sp(c).edit().putInt("minutes", minutes).putLong("at", at).apply();
        schedule(c, at);
    }

    /** After this app is updated (Android drops its alarms): the timer that was running goes on. */
    static void restore(Context c) {
        long at = sp(c).getLong("at", 0);
        schedule(c, at > System.currentTimeMillis() ? at : 0);
    }

    /** After the TV boots: a timer from before it went off is over. */
    static void clear(Context c) {
        sp(c).edit().putLong("at", 0).apply();
    }

    private static void schedule(Context c, long at) {
        AlarmManager alarms = c.getSystemService(AlarmManager.class);
        PendingIntent fire = PendingIntent.getBroadcast(c, 0, new Intent(c, SleepTimer.class),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        alarms.cancel(fire);
        if (at == 0) return;
        // Exact when allowed (USE_EXACT_ALARM, Android 13+); else Android may run it up to ~10 minutes late.
        if (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()) {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire);
        } else {
            alarms.setWindow(AlarmManager.RTC_WAKEUP, at, 60_000L, fire);
        }
    }

    private static SharedPreferences sp(Context c) {
        return c.getSharedPreferences("sleep", Context.MODE_PRIVATE);
    }

    @Override public void onReceive(Context c, Intent intent) {
        final Context app = c.getApplicationContext();
        sp(app).edit().putLong("at", 0).apply();
        final PendingResult done = goAsync();
        new Thread(() -> {
            try (Adb adb = Adb.connect(app, 10_000, null)) {
                adb.shell("input keyevent KEYCODE_SLEEP");
                AppLog.w("sleep timer: TV off");
            } catch (IOException | RuntimeException e) {
                AppLog.w("sleep timer: " + e.getMessage());
            } finally {
                done.finish();
            }
        }).start();
    }
}
