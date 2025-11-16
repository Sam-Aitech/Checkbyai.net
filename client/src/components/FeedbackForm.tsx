import { useState } from "react";
import { Star, ThumbsUp, ThumbsDown, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface FeedbackFormProps {
  verificationId?: number;
  onSubmitSuccess?: () => void;
}

export default function FeedbackForm({ verificationId, onSubmitSuccess }: FeedbackFormProps) {
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [helpful, setHelpful] = useState<boolean | null>(null);
  const [accuracy, setAccuracy] = useState<string>("");
  const [suggestedResult, setSuggestedResult] = useState<string>("");
  const [comment, setComment] = useState<string>("");
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const submitFeedbackMutation = useMutation({
    mutationFn: async (feedbackData: any) => {
      return await apiRequest("POST", "/api/feedback", feedbackData);
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({
        title: "Feedback submitted",
        description: "Thank you for helping us improve our AI verification!",
      });
      if (onSubmitSuccess) {
        onSubmitSuccess();
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to submit feedback",
        description: error.message || "Please try again later",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (rating === 0) {
      toast({
        title: "Rating required",
        description: "Please select a star rating before submitting",
        variant: "destructive",
      });
      return;
    }

    const feedbackData = {
      verificationId: verificationId || null,
      rating,
      helpful: helpful === null ? null : helpful,
      accuracy: accuracy || null,
      suggestedResult: suggestedResult || null,
      comment: comment || null,
    };

    submitFeedbackMutation.mutate(feedbackData);
  };

  if (submitted) {
    return (
      <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center space-x-2 text-green-700 dark:text-green-300">
            <ThumbsUp className="w-5 h-5" />
            <p className="font-medium">Thank you for your feedback!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="feedback-form">
      <CardHeader>
        <CardTitle className="text-lg">Help Us Improve</CardTitle>
        <CardDescription>
          Your feedback helps train our AI to become more accurate at detecting fake documents
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Star Rating */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">How would you rate this verification?</Label>
          <div className="flex space-x-2" data-testid="star-rating">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                className="focus:outline-none transition-transform hover:scale-110"
                data-testid={`star-${star}`}
              >
                <Star
                  className={`w-8 h-8 ${
                    (hoveredRating || rating) >= star
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-gray-300 dark:text-gray-600"
                  }`}
                />
              </button>
            ))}
          </div>
          {rating > 0 && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {rating === 5 && "Excellent!"}
              {rating === 4 && "Very good"}
              {rating === 3 && "Good"}
              {rating === 2 && "Fair"}
              {rating === 1 && "Needs improvement"}
            </p>
          )}
        </div>

        {/* Helpful Toggle */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Was this verification helpful?</Label>
          <div className="flex space-x-3">
            <Button
              type="button"
              variant={helpful === true ? "default" : "outline"}
              size="sm"
              onClick={() => setHelpful(true)}
              className="flex items-center space-x-2"
              data-testid="helpful-yes"
            >
              <ThumbsUp className="w-4 h-4" />
              <span>Yes</span>
            </Button>
            <Button
              type="button"
              variant={helpful === false ? "default" : "outline"}
              size="sm"
              onClick={() => setHelpful(false)}
              className="flex items-center space-x-2"
              data-testid="helpful-no"
            >
              <ThumbsDown className="w-4 h-4" />
              <span>No</span>
            </Button>
          </div>
        </div>

        {/* Accuracy Assessment */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Do you believe the result was accurate?</Label>
          <RadioGroup value={accuracy} onValueChange={setAccuracy} data-testid="accuracy-assessment">
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="correct" id="correct" data-testid="accuracy-correct" />
              <Label htmlFor="correct" className="font-normal cursor-pointer">
                Yes, the result appears correct
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="incorrect" id="incorrect" data-testid="accuracy-incorrect" />
              <Label htmlFor="incorrect" className="font-normal cursor-pointer">
                No, I believe the result is wrong
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="unsure" id="unsure" data-testid="accuracy-unsure" />
              <Label htmlFor="unsure" className="font-normal cursor-pointer">
                I'm not sure
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Suggested Result (if incorrect) */}
        {accuracy === "incorrect" && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">What do you think the correct result should be?</Label>
            <RadioGroup value={suggestedResult} onValueChange={setSuggestedResult} data-testid="suggested-result">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="genuine" id="suggest-genuine" data-testid="suggest-genuine" />
                <Label htmlFor="suggest-genuine" className="font-normal cursor-pointer">
                  Genuine
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="suspicious" id="suggest-suspicious" data-testid="suggest-suspicious" />
                <Label htmlFor="suggest-suspicious" className="font-normal cursor-pointer">
                  Suspicious
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="fake" id="suggest-fake" data-testid="suggest-fake" />
                <Label htmlFor="suggest-fake" className="font-normal cursor-pointer">
                  Fake
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}

        {/* Comment */}
        <div className="space-y-2">
          <Label htmlFor="comment" className="text-sm font-medium">
            Additional comments (optional)
          </Label>
          <Textarea
            id="comment"
            placeholder="Tell us more about your experience or any issues you encountered..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="min-h-[100px]"
            data-testid="feedback-comment"
          />
        </div>

        {/* Submit Button */}
        <Button
          onClick={handleSubmit}
          disabled={submitFeedbackMutation.isPending || rating === 0}
          className="w-full"
          data-testid="submit-feedback"
        >
          {submitFeedbackMutation.isPending ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Submit Feedback
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
