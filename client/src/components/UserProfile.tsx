import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Crown, User, LogOut, Settings, LayoutDashboard, CreditCard } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { unwrapApiEnvelope } from "@/lib/apiEnvelope";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { TIER_LABELS } from "@shared/planTiers";

export default function UserProfile() {
  const { user, isAuthenticated, isPro, isAdmin, tier } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [openingPortal, setOpeningPortal] = useState(false);

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
      toast({
        title: "Logged out",
        description: "You have been successfully logged out.",
      });
      setLocation("/");
      window.location.reload();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleOpenBillingPortal = async () => {
    try {
      setOpeningPortal(true);
      const res = await apiRequest("POST", "/api/billing/portal");
      const envelope = await res.json();
      const data = unwrapApiEnvelope<Record<string, any>>(envelope);
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(envelope.error || data.message || "No portal URL returned");
      }
    } catch (error: any) {
      toast({
        title: "Could not open billing portal",
        description: error.message || "Please try again in a moment.",
        variant: "destructive",
      });
      setOpeningPortal(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" asChild>
          <a href="/login">Sign In</a>
        </Button>
      </div>
    );
  }

  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}` || user?.email?.[0]?.toUpperCase() || 'U';

  return (
    <div className="flex items-center gap-2">
      {isPro && (
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
          <Crown className="h-3 w-3 mr-1" />
          {TIER_LABELS[tier]}
        </Badge>
      )}
      {isAdmin && (
        <Badge variant="default">Admin</Badge>
      )}
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarImage src={user?.profileImageUrl ?? undefined} alt={user?.email || ''} />
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">
                {user?.firstName && user?.lastName 
                  ? `${user.firstName} ${user.lastName}`
                  : user?.email
                }
              </p>
              <p className="text-xs leading-none text-muted-foreground">
                {user?.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {isPro && (
            <>
              <DropdownMenuItem onClick={() => setLocation('/pro-dashboard')} data-testid="menu-pro-dashboard">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                <span>Pro Dashboard</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleOpenBillingPortal} disabled={openingPortal} data-testid="menu-manage-subscription">
                <CreditCard className="mr-2 h-4 w-4" />
                <span>{openingPortal ? "Opening…" : "Manage Subscription"}</span>
              </DropdownMenuItem>
            </>
          )}

          {!isPro && (
            <DropdownMenuItem onClick={() => setLocation('/pricing')}>
              <Crown className="mr-2 h-4 w-4" />
              <span>Upgrade to Pro</span>
            </DropdownMenuItem>
          )}
          
          {isAdmin && (
            <DropdownMenuItem asChild>
              <a href="/admin">
                <Settings className="mr-2 h-4 w-4" />
                <span>Admin Portal</span>
              </a>
            </DropdownMenuItem>
          )}
          
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}