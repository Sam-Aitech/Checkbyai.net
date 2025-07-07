import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
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
import { Crown, User, LogOut, Settings } from "lucide-react";
import SubscriptionModal from "./SubscriptionModal";

export default function UserProfile() {
  // Temporarily disable auth to prevent infinite loops
  const user = null;
  const isAuthenticated = false;
  const isPro = false;
  const isAdmin = false;
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" asChild>
          <a href="/api/login">Sign In</a>
        </Button>
      </div>
    );
  }

  const initials = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}` || user?.email?.[0]?.toUpperCase() || 'U';

  return (
    <>
      <div className="flex items-center gap-2">
        {isPro && (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
            <Crown className="h-3 w-3 mr-1" />
            Pro
          </Badge>
        )}
        {isAdmin && (
          <Badge variant="default">Admin</Badge>
        )}
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.profileImageUrl} alt={user?.email || ''} />
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
            
            {!isPro && (
              <DropdownMenuItem onClick={() => setShowSubscriptionModal(true)}>
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
            <DropdownMenuItem asChild>
              <a href="/api/logout">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SubscriptionModal
        open={showSubscriptionModal}
        onOpenChange={setShowSubscriptionModal}
        onSuccess={() => {
          setShowSubscriptionModal(false);
          window.location.reload(); // Refresh to update user data
        }}
      />
    </>
  );
}