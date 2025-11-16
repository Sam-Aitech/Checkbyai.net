import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Star, ThumbsUp, CheckCircle, XCircle, HelpCircle, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

interface FeedbackStats {
  totalFeedback: number;
  averageRating: number;
  helpfulCount: number;
  accuracyBreakdown: {
    correct: number;
    incorrect: number;
    unsure: number;
  };
  recentFeedback: Array<{
    id: number;
    rating: number | null;
    comment: string | null;
    helpful: boolean | null;
    accuracy: string | null;
    suggestedResult: string | null;
    createdAt: Date;
  }>;
}

export default function FeedbackAnalytics() {
  const { data: stats, isLoading } = useQuery<FeedbackStats>({
    queryKey: ['/api/feedback/stats'],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const totalAccuracyResponses = (stats.accuracyBreakdown.correct || 0) + (stats.accuracyBreakdown.incorrect || 0) + (stats.accuracyBreakdown.unsure || 0);
  
  const accuracyPercentage = totalAccuracyResponses > 0
    ? Math.round((stats.accuracyBreakdown.correct / totalAccuracyResponses) * 100)
    : 0;

  const helpfulPercentage = stats.totalFeedback > 0
    ? Math.round((stats.helpfulCount / stats.totalFeedback) * 100)
    : 0;
    
  const displayRating = typeof stats.averageRating === 'number' && !isNaN(stats.averageRating) 
    ? stats.averageRating 
    : 0;

  return (
    <div className="space-y-6" data-testid="feedback-analytics">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Feedback */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Feedback</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalFeedback}</div>
            <p className="text-xs text-muted-foreground">
              User responses collected
            </p>
          </CardContent>
        </Card>

        {/* Average Rating */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold flex items-center">
              {displayRating.toFixed(1)}
              <span className="text-sm text-muted-foreground ml-1">/ 5.0</span>
            </div>
            <div className="flex mt-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-4 h-4 ${
                    star <= Math.round(displayRating)
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-gray-300"
                  }`}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Helpful Percentage */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Helpful Results</CardTitle>
            <ThumbsUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{helpfulPercentage}%</div>
            <p className="text-xs text-muted-foreground">
              {stats.helpfulCount} found helpful
            </p>
          </CardContent>
        </Card>

        {/* Accuracy Percentage */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Perceived Accuracy</CardTitle>
            <CheckCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{accuracyPercentage}%</div>
            <p className="text-xs text-muted-foreground">
              Marked as correct
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Accuracy Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Accuracy Feedback Breakdown</CardTitle>
          <CardDescription>How users rated the accuracy of our AI verification</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-sm font-medium">Correct</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-48 bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                  <div
                    className="bg-green-500 h-2.5 rounded-full"
                    style={{
                      width: totalAccuracyResponses > 0
                        ? `${(stats.accuracyBreakdown.correct / totalAccuracyResponses) * 100}%`
                        : '0%',
                    }}
                  ></div>
                </div>
                <span className="text-sm font-medium w-12 text-right">
                  {stats.accuracyBreakdown.correct}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <XCircle className="w-5 h-5 text-red-500" />
                <span className="text-sm font-medium">Incorrect</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-48 bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                  <div
                    className="bg-red-500 h-2.5 rounded-full"
                    style={{
                      width: totalAccuracyResponses > 0
                        ? `${(stats.accuracyBreakdown.incorrect / totalAccuracyResponses) * 100}%`
                        : '0%',
                    }}
                  ></div>
                </div>
                <span className="text-sm font-medium w-12 text-right">
                  {stats.accuracyBreakdown.incorrect}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <HelpCircle className="w-5 h-5 text-yellow-500" />
                <span className="text-sm font-medium">Unsure</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-48 bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                  <div
                    className="bg-yellow-500 h-2.5 rounded-full"
                    style={{
                      width: totalAccuracyResponses > 0
                        ? `${(stats.accuracyBreakdown.unsure / totalAccuracyResponses) * 100}%`
                        : '0%',
                    }}
                  ></div>
                </div>
                <span className="text-sm font-medium w-12 text-right">
                  {stats.accuracyBreakdown.unsure}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Feedback */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Feedback</CardTitle>
          <CardDescription>Latest user feedback and comments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.recentFeedback.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No feedback received yet
              </p>
            ) : (
              stats.recentFeedback.map((fb) => (
                <div
                  key={fb.id}
                  className="border-l-2 border-blue-500 pl-4 py-2 space-y-2"
                  data-testid={`feedback-item-${fb.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {fb.rating && (
                        <div className="flex items-center space-x-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`w-4 h-4 ${
                                star <= fb.rating!
                                  ? "fill-yellow-400 text-yellow-400"
                                  : "text-gray-300"
                              }`}
                            />
                          ))}
                        </div>
                      )}
                      {fb.accuracy && (
                        <Badge
                          variant={
                            fb.accuracy === 'correct'
                              ? 'default'
                              : fb.accuracy === 'incorrect'
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {fb.accuracy}
                        </Badge>
                      )}
                      {fb.suggestedResult && (
                        <Badge variant="outline">
                          Suggested: {fb.suggestedResult}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(fb.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  {fb.comment && (
                    <p className="text-sm text-gray-700 dark:text-gray-300 italic">
                      "{fb.comment}"
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
