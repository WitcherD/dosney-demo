using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

namespace Dosney.Progress.Database;

[Index(nameof(UserId))]
[Index(nameof(VideoId))]
public class ProgressSession
{
    [Key]
    public string SessionId { get; set; }
    public string VideoId { get; set; }
    public string UserId { get; set; }
    public long ProgressFrom { get; set; }
    public long ProgressTo { get; set; }
    public long TimestampFrom { get; set; }
    public long TimestampTo { get; set; }
}